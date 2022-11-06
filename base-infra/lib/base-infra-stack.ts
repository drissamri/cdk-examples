import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {StringParameter} from "aws-cdk-lib/aws-ssm";
import {HostedZone, IHostedZone, RecordSet, RecordTarget, RecordType} from "aws-cdk-lib/aws-route53";
import {DnsValidatedCertificate} from "aws-cdk-lib/aws-certificatemanager";
import {DomainName, EndpointType, SecurityPolicy} from "aws-cdk-lib/aws-apigateway";
import {ApiGateway} from "aws-cdk-lib/aws-route53-targets";

export class BaseInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Lookup the default Hosted Zone from the Landing Zone
     */
    const hostedZoneId: string = StringParameter.fromStringParameterAttributes(this, 'HostedZoneId', {
      parameterName: '/LZ/DNS/PublicHostedZone/ID',
    }).stringValue;
    const zoneName: string = StringParameter.fromStringParameterAttributes(this, 'ZoneName', {
      parameterName: '/LZ/DNS/PublicHostedZone/DomainName',
    }).stringValue;

    const hostedZone: IHostedZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName,
    });

    /**
     * set a subdomain (prefix) for our api
     */
    const subDomainPrefix: string = 'api';
    const subDomain: string = `${subDomainPrefix}.${zoneName}`;

    /**
     * Create a validated certificate for the subdomain based on the hosted zone
     */
    const certificate: DnsValidatedCertificate = new DnsValidatedCertificate(this, 'ApiGatewayCertificate', {
      domainName: subDomain,
      hostedZone,
    });

    /**
     * Setup a custom domain in AWS API Gateway that can be used by other applications
     */
    const domain = new DomainName(this, "ApiGwDomainName", {
      domainName: subDomain,
      certificate,
      endpointType: EndpointType.EDGE,
    })
  }
}
