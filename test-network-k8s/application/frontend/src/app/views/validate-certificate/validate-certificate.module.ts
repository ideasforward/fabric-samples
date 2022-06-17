import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ValidateCertificateRoutingModule } from './validate-certificate-routing.module';
import { ValidateCertificateComponent } from './validate-certificate.component';
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap';


@NgModule({
  declarations: [
    ValidateCertificateComponent
  ],
  imports: [
    CommonModule,
    ValidateCertificateRoutingModule,
    NgbAccordionModule
  ]
})
export class ValidateCertificateModule { }
