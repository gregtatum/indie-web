import * as React from 'react';
import * as ReactDOM from 'react-dom';

const element = <h1>Hello World! </h1>;

const div = document.createElement('div');
document.body.appendChild(div);

ReactDOM.render(element, div);
