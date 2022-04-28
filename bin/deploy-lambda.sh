set -x # Show command execution
cd src/lambda
zip -r ../../lambda.zip .
cd ../..

aws lambda update-function-code               \
  --zip-file "fileb://$(realpath lambda.zip)" \
  --function-name chords-lambda               \
  --publish
  # --dry-run

aws lambda update-function-code               \
  --zip-file "fileb://$(realpath lambda.zip)" \
  --function-name chords-lambda-localhost     \
  --publish
  # --dry-run

rm lambda.zip
