import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './Login';

describe('Login render', () => {
  it('shows credential fields with the server connection preconfigured', () => {
    const qc = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <Login onConnected={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).toContain('Password');
    expect(html).toContain('type="password"');
    expect(html).not.toContain('Server URL');
    expect(html).not.toContain('Sync ID');
    expect(html).toContain('encryption key');
    expect(html).toContain('Analyze my finances');
  });
});
