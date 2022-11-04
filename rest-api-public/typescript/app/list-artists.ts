import {APIGatewayProxyEvent, APIGatewayProxyStructuredResultV2, Context} from 'aws-lambda';
import {LambdaInterface} from "@aws-lambda-powertools/commons";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, ScanCommand} from "@aws-sdk/lib-dynamodb";
import {Artist} from "./model/artist";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

class Lambda implements LambdaInterface {
    public async handler(_event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyStructuredResultV2> {
        // Only an example, please do your research before using the Scan command in production!
        const params:ScanCommand = new ScanCommand( {
            TableName: process.env.ARTIST_TABLE,
            Limit: 20
        });

        const result = await ddbDocClient.send(params);
        const artists = result.Items as Artist[]

        return {
            statusCode: 200,
            body: JSON.stringify(artists),
        }
    }
}

const handlerClass = new Lambda();
export const handler = handlerClass.handler.bind(handlerClass);