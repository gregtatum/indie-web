rm -rf dist
parcel build src/index.html --public-url '.'
cp _redirects ./dist
