set -x # Show command execution
aws lambda list-functions
aws lambda get-function --function-name browser-chords-lambda
aws lambda get-function --function-name browser-chords-lambda-localhost
