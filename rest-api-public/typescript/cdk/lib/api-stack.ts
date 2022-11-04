import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {BillingMode, Table} from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {Architecture} from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as Mustache from 'mustache';
import {RetentionDays} from "aws-cdk-lib/aws-logs";
import * as fs from "fs";
import {ServicePrincipal} from "aws-cdk-lib/aws-iam";

export class ApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const ddb = this.createDatabase()

        const listLambda = this.createFunction(
            'ListArtistsLambda', 'list-artists', 'list-artists.ts', ddb.tableName)
        ddb.grantReadData(listLambda)

        const getLambda = this.createFunction(
            'GetArtistLambda', 'get-artist', 'get-artist.ts', ddb.tableName)
        ddb.grantReadData(getLambda)

        const createLambda = this.createFunction(
            'CreateArtistLambda', 'create-artist', 'create-artist.ts', ddb.tableName)
        ddb.grantReadWriteData(createLambda)


        const restApi = new apigateway.SpecRestApi(this, 'ArtistsApi', {
            apiDefinition: apigateway.ApiDefinition.fromInline(
                this.generateOpenApiSpec({
                    'ListArtistsLambda': listLambda.functionArn,
                    'CreateArtistLambda': createLambda.functionArn,
                    'GetArtistLambda': getLambda.functionArn
                })),
            deployOptions: {
                description: 'This is the common standard api description for artists.',
                loggingLevel: apigateway.MethodLoggingLevel.ERROR,
                metricsEnabled: true,
                dataTraceEnabled: true,
            },
        });

        const apigwServicePrincipal = new ServicePrincipal('apigateway.amazonaws.com');
        listLambda.grantInvoke(apigwServicePrincipal)
        createLambda.grantInvoke(apigwServicePrincipal)
        getLambda.grantInvoke(apigwServicePrincipal)

        // TODO: Should be accessible from this specific REST API only?
        /*   createLambda.addPermission('PermitAPIGWInvocation', {
            principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
            sourceArn: restApi.arnForExecuteApi(),
            action: 'lambda:InvokeFunction'
        });*/
    }

    private createDatabase(): Table {
        return new dynamodb.Table(this, "ArtistTable", {
            tableName: 'artists',
            partitionKey: {name: 'name', type: dynamodb.AttributeType.STRING},
            billingMode: BillingMode.PAY_PER_REQUEST
        });
    }

    private createFunction(id: string, name: string, handler: string, tableName: string) {
        return new NodejsFunction(this, id, {
            functionName: name,
            entry: path.join(__dirname, '../../app/' + handler),
            ...this.lambdaConf(tableName)
        });
    }

    private generateOpenApiSpec(vars: any) {
        return this.resolve(Mustache.render(
            fs.readFileSync(path.join(__dirname, '../../openapi.yaml'), 'utf-8'), vars));
    }

    private lambdaConf(tableName: string): any {
        return {
            runtime: lambda.Runtime.NODEJS_16_X,
            architecture: Architecture.ARM_64,
            // Increase the default memory to improve cold starts
            memorySize: 1024,
            handler: 'handler',
            bundling: {
                minify: true
            },
            // Setup logging retention to your team/app requirements but don't forget to set it (=infinite)
            logRetention: RetentionDays.ONE_MONTH,
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                ARTIST_TABLE: tableName,
                POWERTOOLS_SERVICE_NAME: 'artists-api',
            }
        }
    }
}
