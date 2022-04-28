const awsAuthUrl =
  'https://4l7ciz67jsrrdwro5gjwuuxgoy0scvbg.lambda-url.us-east-1.on.aws/';
const dropboxClientId = 'hr4bt75n44tru4l';

function getRedirectUri() {
  let uri = window.location.origin;
  if (window.location.port) {
    uri += ':' + window.location.port;
  }
  return uri + '/login';
}

`https://www.dropbox.com/oauth2/authorize?client_id=${dropboxClientId}&redirect_uri=${getRedirectUri()}&response_type=code"`;
