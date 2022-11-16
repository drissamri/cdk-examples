import * as fs from 'fs';
import * as path from 'path';
import { BuildConfig } from '@ns/cdk-helper';
import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { LogGroupLogDestination } from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Architecture } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cloudwatch from 'aws-cdk-lib/aws-logs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import * as Mustache from 'mustache';

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackConfigProps) {
    super(scope, id, props);

    const ddb = this.createDatabase(props);

    const listLambda = this.createFunction('ListArtists', 'list-artists.ts', ddb.tableName, props);
    const getLambda = this.createFunction('GetArtist', 'get-artist.ts', ddb.tableName, props);
    const createLambda = this.createFunction('CreateArtist', 'create-artist.ts', ddb.tableName, props);

    ddb.grantReadData(getLambda);
    ddb.grantReadData(listLambda);
    ddb.grantReadWriteData(createLambda);

    this.createRestApi(props, listLambda.functionArn, getLambda.functionArn, createLambda.functionArn);
  }

  private createDatabase(props: ApiStackConfigProps): Table {
    return new dynamodb.Table(this, 'ArtistTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: props.buildConfig.Environment == 'Dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });
  }

  private createRestApi(props: ApiStackConfigProps, listArn: string, getArn: string, createArn: string) {
    const apigwLogGroup = new cloudwatch.LogGroup(this, 'ApiGWLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: props.buildConfig.Environment == 'Dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    let api = new apigateway.SpecRestApi(this, 'ArtistsApi', {
      apiDefinition: apigateway.ApiDefinition.fromInline(
        this.generateOpenApiSpec({
          ListArtistsLambda: listArn,
          CreateArtistLambda: createArn,
          GetArtistLambda: getArn,
        })),
      deployOptions: {
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        accessLogDestination: new LogGroupLogDestination(apigwLogGroup),
        metricsEnabled: true,
        tracingEnabled: true,
      },
    });

    if (props.buildConfig.Parameters != null && props.buildConfig.Parameters.Domain != null) {
      new apigateway.BasePathMapping(this, 'MyBasePathMapping', {
        restApi: api,
        domainName: props.buildConfig.Parameters.Domain,
        basePath: props.buildConfig.Parameters.BasePath,
      });
    }
  }

  private createFunction(id: string, handler: string, tableName: string, props: ApiStackConfigProps): lambda.Function {
    let apiLambda = new NodejsFunction(this, id, {
      entry: path.join(__dirname, '../../app/' + handler),
      runtime: lambda.Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      // Increased memory to improve cold starts
      memorySize: 1024,
      handler: 'handler',
      bundling: {
        minify: true,
      },
      // TODO: Setup logging retention to your team/app requirements but don't forget to set it (=infinite)
      logRetention: RetentionDays.ONE_MONTH,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ARTIST_TABLE: tableName,
        POWERTOOLS_SERVICE_NAME: props.buildConfig.App,
      },
    });

    const apigwServicePrincipal = new ServicePrincipal('apigateway.amazonaws.com');
    apiLambda.grantInvoke(apigwServicePrincipal);

    return apiLambda;
  }

  private generateOpenApiSpec(vars: any) {
    return this.resolve(Mustache.render(
      fs.readFileSync(path.join(__dirname, '../../openapi.yaml'), 'utf-8'), vars));
  }
}

interface ApiStackConfigProps extends StackProps {
  buildConfig: BuildConfig,
}
