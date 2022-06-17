/*
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Contract,
  DefaultEventHandlerStrategies,
  DefaultQueryHandlerStrategies,
  Gateway,
  GatewayOptions,
  Network,
  Transaction,
  Wallet,
  Wallets,
  X509Identity,
} from 'fabric-network';
import * as common from 'fabric-common';
import * as config from '../config/config';
import { logger } from '../utilities/logger';
import { handleError } from '../utilities/errors';
import * as protos from 'fabric-protos';
import yaml from 'js-yaml';
import * as fs from 'fs';

class Fabric {
  private BlockDecoder = (common as any).BlockDecoder;
  protected walletDir!: Wallet;
  protected ccp: Record<string, unknown>;
  public contracts: Record<string, unknown>;
  protected userIdentity!: X509Identity;
  protected userId!: string;

  protected constructor() {
    this.ccp = {};
    this.contracts = {};
  }

  public static async build<T extends Fabric>(
    C: new () => T,
    userId: string,
    userIdentity: X509Identity
  ): Promise<T> {
    const fabric = new C();
    await fabric.init(userId, userIdentity);
    return fabric;
  }

  public async init(userId: string, userIdentity: X509Identity) {
    this.userId = userId;
    this.userIdentity = userIdentity;
    this.walletDir = await this.loadWallet();
    this.ccp = yaml.load(
      fs.readFileSync(config.fabricGatewayDir + '/' + config.fabric_ccp_name, 'utf8')
    ) as Record<string, unknown>;
    this.contracts = await this.loadContracts(userId);
  }

  protected loadWallet = async (): Promise<Wallet> => {
    return await Wallets.newFileSystemWallet(config.fabricWalletDir);
  };

  private loadContracts = async (
    userId: string
  ): Promise<{
    docNotarizationContract: Contract;
    qsccContract: Contract;
  }> => {
    const gateteway = await this.createGateway(userId);
    const network = await this.getNetwork(gateteway);
    const docNotarizationContract = network.getContract(config.chaincodeName);
    const qsccContract = network.getContract('qscc');
    return { docNotarizationContract, qsccContract };
  };

  private createGateway = async (identity: string): Promise<Gateway> => {
    const gateway = new Gateway();
    const options: GatewayOptions = {
      identity,
      wallet: this.walletDir,
      discovery: { enabled: true, asLocalhost: false },
      eventHandlerOptions: {
        commitTimeout: config.commitTimeout,
        endorseTimeout: config.endorseTimeout,
        strategy: DefaultEventHandlerStrategies.PREFER_MSPID_SCOPE_ANYFORTX,
      },
      queryHandlerOptions: {
        timeout: config.queryTimeout,
        strategy: DefaultQueryHandlerStrategies.PREFER_MSPID_SCOPE_ROUND_ROBIN,
      },
    };

    await gateway.connect(this.ccp, options);
    return gateway;
  };

  private getNetwork = async (gateway: Gateway): Promise<Network> => {
    return await gateway.getNetwork(config.channelName);
  };

  public evaluateTransaction = async (
    contract: Contract,
    transactionName: string,
    ...transactionArgs: string[]
  ): Promise<Buffer> => {
    const transaction = contract.createTransaction(transactionName);
    const transactionId = transaction.getTransactionId();
    logger.trace({ transaction }, 'Evaluating transaction');

    try {
      const payload = await transaction.evaluate(...transactionArgs);
      logger.trace(
        { transactionId: transactionId, payload: payload.toString() },
        'Evaluate transaction response received'
      );
      return payload;
    } catch (err) {
      throw handleError(transactionId, err);
    }
  };

  public submitTransaction = async (transaction: Transaction, ...transactionArgs: string[]): Promise<Buffer> => {
    logger.trace({ transaction }, 'Submitting transaction');
    const txnId = transaction.getTransactionId();

    try {
      const payload = await transaction.submit(...transactionArgs);
      logger.trace(
        { transactionId: txnId, payload: payload.toString() },
        'Submit transaction response received'
      );
      return payload;
    } catch (err) {
      throw handleError(txnId, err);
    }
  };

  public getTransaction = async (
    qsccContract: Contract,
    transactionId: string
  ): Promise<Record<string, unknown>> => {
    const data = await this.evaluateTransaction(
      qsccContract,
      // 'GetBlockByTxID',
      'GetTransactionByID',
      config.channelName,
      transactionId
    );

    const processedTransaction = protos.protos.ProcessedTransaction.decode(data);
    const validationCode = protos.protos.TxValidationCode[processedTransaction.validationCode];
    const transactionEnvelope = this.BlockDecoder.decodeTransaction(data);
    // const processedBlock = protos.common.Block.decode(data);
    // const blockEnvelope = this.BlockDecoder.decodeBlock(processedBlock);
    this.traverse(transactionEnvelope);

    return { validationCode: validationCode, transactionEnvelope: transactionEnvelope };
  };

  private traverse = (obj: Record<string, unknown>) => {
    for (const key in obj) {
      if (Buffer.isBuffer(obj[key])) {
        if (['args'].includes(key)) {
          obj[key] = (obj[key] as Buffer).toString('base64');
        } else if (
          ['previous_hash', 'previous_hash', 'proposal_hash', 'data_hash', 'signature', 'nonce'].includes(key)
        ) {
          obj[key] = (obj[key] as Buffer).toString('hex');
        } else {
          if (['value', 'payload'.includes(key)]) {
            try {
              obj[key] = JSON.parse((obj[key] as Buffer).toString('utf-8'));
            } catch (e) {
              obj[key] = (obj[key] as Buffer).toString('utf-8');
            }
          } else {
            obj[key] = (obj[key] as Buffer).toString('utf-8');
          }
        }
      }
      if (obj[key] !== null && typeof obj[key] == 'object') {
        this.traverse(obj[key] as Record<string, unknown>);
      }
    }
  };

  public getBlockHeight = async (qscc: Contract): Promise<number | Long.Long> => {
    const data = await qscc.evaluateTransaction('GetChainInfo', config.channelName);
    const info = protos.common.BlockchainInfo.decode(data);
    const blockHeight = info.height;

    logger.debug('Current block height: %d', blockHeight);
    return blockHeight;
  };
}

export default Fabric;
