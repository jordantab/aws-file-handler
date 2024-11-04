from urllib.parse import urlparse
import boto3
import os
import uuid
from openai import OpenAI

region = os.getenv('AWS_REGION') or 'us-east-1'
openai_api_key = os.getenv('OPENAI_API_KEY')

# Set up clients
dynamodb = boto3.client('dynamodb', region_name=region)
s3 = boto3.client('s3', region_name=region)


def download_file_from_s3(bucket_name, file_key):
    """Gets file contents from s3 bucket"""
    try:
        response = s3.get_object(Bucket=bucket_name, Key=file_key)
        file_content = response['Body'].read().decode('utf-8')
        return file_content

    except Exception as e:
        print(f"Error fetching file from S3: {e}")
        return None


def generate_summary(file_content):
    """
    Generates a summary for the given input text using OpenAI's GPT-4.
    """
    try:
        # Initialize openai client
        client = OpenAI(api_key=openai_api_key)

        # User input to the llm
        user_message = "Please summarize the following text:\n\n" + file_content
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that summarizes text. Don't return an explanation, just a summary of the input text."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=500,
            temperature=0.1
        )

        # Extract the summary from the response
        summary = response.choices[0].message.content
        return summary

    except Exception as e:
        print(f"Error generating summary: {e}")
        return None


def append_summary_to_file_content(file_content, summary):
    """Appends summary to file content on a new line"""
    return file_content + "\n\nSummary:\n" + summary


def upload_file_to_s3(bucket_name, file_content):
    """
    Uploads the input file content to s3 bucket
    """
    # unique item id of the new file
    new_file_key = f"{str(uuid.uuid4())}_output.txt"

    try:
        # Upload the file content as a new object in S3
        s3.put_object(
            Bucket=bucket_name,
            Key=new_file_key,
            Body=file_content.encode('utf-8')
        )
        new_file_path = (
            f"https://{bucket_name}.s3.{region}.amazonaws.com/{new_file_key}"
        )
        print(f"File uploaded to S3 at {new_file_path}")
        return new_file_path
    except Exception as e:
        print(f"Error uploading file to S3: {e}")
        return None


def update_dynamodb_entry(table_name, item_id, summary, new_file_path):
    """Updates DynamoDB entry with the generated summary and new file path."""
    try:
        dynamodb.update_item(
            TableName=table_name,
            Key={'id': {'S': item_id}},
            UpdateExpression="SET summary = :summary, output_file_path = :output_path",
            ExpressionAttributeValues={
                ':summary': {'S': summary},
                ':output_path': {'S': new_file_path}
            }
        )
        print("DynamoDB entry updated successfully.")
    except Exception as e:
        print(f"Error updating DynamoDB entry: {e}")


def main():
    """
    Orchestrator for file content summary generation and upload to DynamoDB
    """

    table_name = os.getenv('TABLE_NAME')
    bucket_name = os.getenv('BUCKET_NAME')
    item_id = os.getenv('ITEM_ID')
    s3_link = os.getenv('S3_LINK')

    # Print out the environment variables for verification
    print(f'TABLE_NAME: {table_name}')
    print(f'BUCKET_NAME: {bucket_name}')
    print(f'ITEM_ID: {item_id}')
    print(f'S3_LINK: {s3_link}')

    parsed_url = urlparse(s3_link)
    print(f"Parsed url: {parsed_url}")

    # Extract the bucket name
    bucket_name = parsed_url.netloc.split('.')[0]

    # Extract file key associated with the new entry
    file_key = parsed_url.path.lstrip('/')
    print(f'Bucket Name: {bucket_name}')
    print(f'File Key: {file_key}')

    # Get uploaded file content
    file_content = download_file_from_s3(bucket_name, file_key)
    print("file_content: ", file_content)

    # Generate file content summary
    summary = generate_summary(file_content)
    print("summary: ", summary)

    # Append summary to the end of file
    new_file_content = append_summary_to_file_content(file_content, summary)
    print("new_file_content: ", new_file_content)

    # Create new file and upload to s3
    new_file_path = upload_file_to_s3(bucket_name, new_file_content)
    print("new_file_path: ", new_file_path)

    # Update DynamoDB entry with summary and new file path
    update_dynamodb_entry(table_name, item_id, summary, new_file_path)
    print("File summary and upload to DynamoDB successful.")


if __name__ == "__main__":
    main()
