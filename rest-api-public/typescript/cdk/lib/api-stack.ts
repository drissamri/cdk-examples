import * as fs from 'fs';
import * as path from 'path';
import { BuildConfig } from '@ns/cdk-helper';
import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { EndpointType, LogGroupLogDestination } from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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

      // TODO: Discuss Environment config
      removalPolicy: props.buildConfig.Environment == 'Dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });
  }

  private createRestApi(props: ApiStackConfigProps, listArn: string, getArn: string, createArn: string) {
    const apigwLogGroup = new cloudwatch.LogGroup(this, 'ApiGWLogs', {
      retention: RetentionDays.ONE_WEEK,
      // TODO: Discuss Environment config
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
      // Disable internal AWS DNS if a custom domain is enabled
      disableExecuteApiEndpoint: this.isCustomDomainEnabled(props),
      endpointTypes: [
        EndpointType.REGIONAL,
      ],
      // Enable compression: minimumCompressionSize
    });

    if (this.isCustomDomainEnabled(props)) {
      new apigateway.BasePathMapping(this, 'ApiBasePathMapping', {
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
      // Increased memory to improve cold starts
      memorySize: 1792,
      handler: 'handler',
      bundling: {
        minify: true,
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
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

  private isCustomDomainEnabled(props: ApiStackConfigProps) {
    return (props.buildConfig.Parameters != null && props.buildConfig.Parameters.Domain != null);
  }
}


interface ApiStackConfigProps extends StackProps {
  buildConfig: BuildConfig,
}
