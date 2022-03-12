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

mv src/components/App.css src/index.css
rm -rf src/store
rm -rf src/components
rm src/test/store.test.ts
rm src/test/app.test.tsx
rm bin/remove-react.sh
rm src/index.tsx

cat > src/index.ts <<- EOM
import './index.css';
EOM

cat > src/index.html <<- EOM
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title></title>
</head>
<body>
  <script src="index.ts"></script>
</body>
</html>
EOM

set +x # Hide command execution

echo ""
echo ""
echo "Manually remove react references from:"
echo "  .babelrc"
echo "  .eslintrc.js"
echo "  tsconfig.json"
