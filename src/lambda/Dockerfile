FROM public.ecr.aws/lambda/nodejs:14

# Assumes your function is named "index.js", and there is a package.json file in the
# app directory
COPY app  ${LAMBDA_TASK_ROOT}

WORKDIR ${LAMBDA_TASK_ROOT}

# Install NPM dependencies for function
RUN npm install

RUN apt-get update \
    && apt-get install -y \
      wget \
      ca-certificates \
    && apt-get autoclean -y \
    && rm -rf /var/lib/apt/lists/*

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "app.handler" ]
