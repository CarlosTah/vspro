import { Module } from '@nestjs/common';
import { IssueClassifierService } from './issue-classifier.service';

/** Issue Classifier — Vision + Tabulador pricing for service businesses. */
@Module({ providers: [IssueClassifierService], exports: [IssueClassifierService] })
export class IssueClassifierModule {}
