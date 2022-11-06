import {APIGatewayProxyEvent, APIGatewayProxyStructuredResultV2} from 'aws-lambda';
import {LambdaInterface} from "@aws-lambda-powertools/commons";
import {v4 as uuidv4} from 'uuid';
import {Artist} from "./model/artist";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, PutCommand} from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

class Lambda implements LambdaInterface {
    public async handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyStructuredResultV2> {
        let artist: Artist = JSON.parse(<string>event.body);

        let id = uuidv4();
        const putCommand = new PutCommand({
            TableName: process.env.ARTIST_TABLE,
            Item: {
                id: id,
                name: artist.name,
                albums_recorded: artist.albums_recorded,
            },
        });

        await ddbDocClient.send(putCommand);
        artist.id = id;

        return {
            statusCode: 200,
            body: JSON.stringify(artist),
        }
    }
}

const handlerClass = new Lambda();
export const handler = handlerClass.handler.bind(handlerClass);