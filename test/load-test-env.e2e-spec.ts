import { testDatabaseName } from './load-test-env';

describe('test database guard', () => {
  it('accepts a database whose name ends with _test', () => {
    expect(
      testDatabaseName(
        'postgresql://user:secret@localhost:5432/pt_grupo05_test?schema=public',
      ),
    ).toBe('pt_grupo05_test');
  });

  it.each([
    ['development database', 'postgresql://user@localhost:5432/pt_grupo05_dev'],
    ['no database name', 'postgresql://user@host_test'],
    ['_test only in the host', 'postgresql://user@db_test:5432/pt_grupo05_dev'],
    [
      '_test only in the fragment',
      'postgresql://localhost/pt_grupo05_dev#_test',
    ],
    [
      '_test only in the query',
      'postgresql://localhost/pt_grupo05_dev?x=_test',
    ],
    [
      '_test only in the user',
      'postgresql://app_test@localhost/pt_grupo05_dev',
    ],
    ['other protocol', 'mysql://localhost/pt_grupo05_test'],
    ['not a URL', 'pt_grupo05_test'],
    ['missing', undefined],
  ])('refuses: %s', (_case, url) => {
    expect(() => testDatabaseName(url)).toThrow();
  });
});
