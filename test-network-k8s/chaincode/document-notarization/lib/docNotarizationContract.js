/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
*/

const {Contract, Context} = require('fabric-contract-api');
const Document = require('./document.js');
const DocumentList = require('./documentList.js');
const QueryUtils = require('./queries.js');


class DocNotarizationContext extends Context {

    constructor() {
        super();
        this.documentList = new DocumentList(this);
    }

}

class DocNotarizationContract extends Contract {
    constructor() {
        super('org.avangard.docNotarizationContract');
    }

    createContext() {
        return new DocNotarizationContext();
    }

    async instantiate(ctx) {
        console.log('Instantiate the contract');
    }


    async issueCertificate(ctx, hash, issuer, mspId, certificate, signature, clientId, clientName, clientSurname, dateOdBirth, timestamp, title, expires) {
        let document = Document.createInstance(hash, issuer, mspId, certificate, signature, clientId, clientName, clientSurname, dateOdBirth, timestamp, title, expires);
        await ctx.documentList.addDocument(document);
        return document;
    }


    async revokeCertificate(ctx,  hash) {
        let query = new QueryUtils(ctx, 'org.avangard.documents');
        const docs =  await query.queryDocumentsByHash(hash);
        const doc = docs[0];
        const key = Document.makeKey([hash, doc.Record.timestamp]);
        let document = await ctx.documentList.getDocument(key);
        document.revoke();
        await ctx.documentList.updateDocument(document);
    }


    async queryDocumentByHash(ctx, hash) {
        let query = new QueryUtils(ctx, 'org.avangard.documents');
        const docs =  await query.queryDocumentsByHash(hash);
        return await this.appendDocHistory(query, docs);
    }

    async queryDocumentsByClient(ctx, clientId, clientFilter) {
        let query = new QueryUtils(ctx, 'org.avangard.documents');
        const docs =  await query.queryDocumentsByClient(clientId);
        return await this.appendDocHistory(query, docs);
    }

    async queryDocumentsByIssuer(ctx, issuer, clientFilter) {
        let query = new QueryUtils(ctx, 'org.avangard.documents');
        const docs = await query.queryDocumentsByIssuer(issuer, clientFilter);
        return await this.appendDocHistory(query, docs);
    }

    async queryDocumentHistory(ctx, hash, timestamp) {
        let query = new QueryUtils(ctx, 'org.avangard.documents');
        return await query.queryDocumentHistory(hash, timestamp);
    }

    async appendDocHistory(query, docs) {
        return await Promise.all(docs.map(async doc => {
            return {...doc, transaction_ids: await query.queryDocumentHistory(doc.Record.hash, doc.Record.timestamp)};
        }));
    }

}

module.exports = DocNotarizationContract;
