#!/usr/bin/env node
import 'source-map-support/register';
import { BuildConfig, Config } from '@ns/cdk-helper';
import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

// NS Specific Config helper: https://dev.azure.com/ns-topaas/NSCAWS/_git/ns-shared-cdk-helper
const buildConfig: BuildConfig = Config(app);


new ApiStack(app, 'RestOpenApiTypescriptStack', {
  env: {
    region: buildConfig.AWSRegion,
    account: buildConfig.AWSAccount,
  },
  buildConfig: buildConfig,
  tags: buildConfig.Tags,
});
