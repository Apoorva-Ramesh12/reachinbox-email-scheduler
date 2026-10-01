import { extractEmails } from './leads';

describe('extractEmails', () => {
  it('finds unique lower-cased addresses in CSV content', () => {
    const csv = 'name,email\nAnn,ANN@Example.com\nBob,bob@example.org\nAnn again,ann@example.com';
    expect(extractEmails(csv)).toEqual(['ann@example.com', 'bob@example.org']);
  });
  it('returns an empty list when nothing matches', () => {
    expect(extractEmails('no addresses here')).toEqual([]);
  });
});
