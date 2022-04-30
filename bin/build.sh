rm -rf dist
parcel build src/index.html
cp _redirects ./dist
