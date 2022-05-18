echo "Bundling webpack"
NODE_ENV=production webpack --json > stats.json

./node_modules/.bin/webpack-bundle-analyzer stats.json
