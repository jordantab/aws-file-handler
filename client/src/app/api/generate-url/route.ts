import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

async function getAWSCredentials() {
  const client = new SecretsManagerClient();
  try {
    // Retrieve the secret with the specified SecretId
    const data = await client.send(
      new GetSecretValueCommand({ SecretId: "AWSAccessKeys" })
    );

    // Parse and return the credentials if found in SecretString
    if ("SecretString" in data) {
      return JSON.parse(data.SecretString!);
    }

    throw new Error("SecretString is missing in the response.");
  } catch (error) {
    console.error(
      "Error retrieving AWS credentials from Secrets Manager:",
      error
    );
    throw error;
  }
}

const credentials = await getAWSCredentials();

// Create s3 client
const s3Client = new S3Client({
  region: credentials.AWS_REGION,
  credentials: {
    accessKeyId: credentials.AWS_ACCESS_KEY_ID!,
    secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get("fileName");
  console.log(fileName);

  if (!fileName) {
    return NextResponse.json(
      { error: "Missing fileName parameter" },
      { status: 400 }
    );
  }

  // S3 pre-signed URL parameters
  const command = new PutObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_S3_BUCKET,
    Key: fileName,
  });

  try {
    //   GET pre-signed URL
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });
    return NextResponse.json({ url: signedUrl }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Error generating pre-signed URL" },
      { status: 500 }
    );
  }
}
