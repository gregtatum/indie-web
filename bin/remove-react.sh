set -x # Show command execution
npm uninstall         \
  eslint-plugin-react \
  react               \
  react-dev           \
  @types/react        \
  redux               \
  redux-thunk         \
  @types/react-dom    \
  react-dom           \
  react-redux         \
  @babel/preset-react

rm src/actions.ts
rm src/create-store.ts
rm src/mount-react.tsx
rm src/reducers.ts
rm src/selectors.ts
rm src/test/app.test.js
rm src/test/store.test.js
rm bin/remove-react.sh

echo "import './index.css';" > src/index.ts

set +x # Hide command execution

echo ""
echo ""
echo "Manually remove react references from:"
echo "  .babelrc"
echo "  .eslintrc.js"
echo "  tsconfig.json"
echo "  src/index.html"
