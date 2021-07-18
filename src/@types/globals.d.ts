type Process = {
  env: {
    NODE_ENV: 'production' | 'development';
  };
};

declare let process: Process;
