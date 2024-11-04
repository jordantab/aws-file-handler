import os

# Placeholder Python script to be run on EC2


def main():
    print('This is a placeholder script.')

    table_name = os.getenv('TABLE_NAME')
    bucket_name = os.getenv('BUCKET_NAME')
    item_id = os.getenv('ITEM_ID')
    s3_link = os.getenv('S3_LINK')

    # Print out the environment variables for verification
    print(f'TABLE_NAME: {table_name}')
    print(f'BUCKET_NAME: {bucket_name}')
    print(f'ITEM_ID: {item_id}')
    print(f'S3_LINK: {s3_link}')


if __name__ == "__main__":
    main()
