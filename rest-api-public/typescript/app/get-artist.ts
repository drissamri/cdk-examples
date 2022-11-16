import { LambdaInterface } from '@aws-lambda-powertools/commons';
import { APIGatewayProxyEvent, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';

class Lambda implements LambdaInterface {
  public async handler(_event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyStructuredResultV2> {
    return {
      statusCode: 200,
      body: JSON.stringify({ username: 'mister' }),
    };
  }
}

const handlerClass = new Lambda();
export const handler = handlerClass.handler.bind(handlerClass);