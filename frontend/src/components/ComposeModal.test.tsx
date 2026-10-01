import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ComposeModal } from './ComposeModal';
import { ToastProvider } from '../context/ToastContext';
import { endpoints } from '../api/endpoints';

vi.mock('../api/endpoints', () => ({ endpoints: { schedule: vi.fn() } }));

const setup = () => {
  const onScheduled = vi.fn();
  render(
    <ToastProvider>
      <ComposeModal open onClose={() => undefined} onScheduled={onScheduled} />
    </ToastProvider>,
  );
  return { onScheduled };
};

describe('ComposeModal', () => {
  it('shows validation errors and does not call the API when empty', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText('Enter a subject')).toBeInTheDocument();
    expect(screen.getByText(/Upload a CSV or text file/)).toBeInTheDocument();
    expect(endpoints.schedule).not.toHaveBeenCalled();
  });

  it('counts uploaded leads and submits the schedule request', async () => {
    vi.mocked(endpoints.schedule).mockResolvedValue({
      campaignId: 'c1', total: 2, senders: 1, effectiveHourlyLimit: 50, firstSendAt: new Date().toISOString(), lastSendAt: new Date().toISOString(),
    });
    const { onScheduled } = setup();
    await userEvent.type(screen.getByLabelText('Subject'), 'Hello');
    await userEvent.type(screen.getByLabelText('Body'), 'Body text');
    const file = new File(['email\na@x.io\nb@x.io\na@x.io'], 'leads.csv', { type: 'text/csv' });
    await userEvent.upload(screen.getByLabelText('Upload leads file'), file);
    expect(await screen.findByText('2 email addresses detected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Schedule 2 emails' }));
    await waitFor(() => expect(onScheduled).toHaveBeenCalled());
    expect(endpoints.schedule).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Hello', emails: ['a@x.io', 'b@x.io'], delaySeconds: 5, hourlyLimit: 50 }));
  });
});
