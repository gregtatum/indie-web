import { createStore } from 'src/store/create-store';
import { App } from 'src/components/App';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';

describe('LinkDropbox', () => {
  it('can render', async () => {
    const store = createStore();
    const { container } = render(
      <Provider store={store as any}>
        <App />
      </Provider>,
    );

    await waitFor(() => screen.getByText(/Browser Chords/));

    const button = screen.getByText(/Connect Dropbox/);
    await waitFor(() => expect(button.getAttribute('href')).toBeTruthy());

    expect(container.firstChild).toMatchSnapshot();
  });
});
