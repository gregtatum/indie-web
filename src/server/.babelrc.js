module.exports = {
  targets: '>5%',
  presets: [
    '@babel/preset-env',
    '@babel/preset-typescript',
    '@babel/preset-react',
  ],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          // Keep up to date with tsconfig.json
          frontend: '../frontend',
          shared: '../shared',
          server: '../server',
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
      },
    ],
  ],
  ignore: ['node_modules', 'dist'],
};
