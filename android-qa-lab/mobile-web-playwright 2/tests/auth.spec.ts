import { test, expect } from './support/fixtures';
import { MSG, VALID_USER } from './support/data';
import { auditCount } from './support/seed';

const { username: USER, password: PASS } = VALID_USER;

test.describe('Authentication', () => {
  test('AUTH-01 valid credentials open the task list @smoke', async ({ loginPage, page }) => {
    const tasks = await loginPage.loginAs(USER, PASS);

    await expect(tasks.welcome).toHaveText('Welcome, qa_user');
    await expect(tasks.summary).toHaveText(MSG.NO_TASKS);
    await expect(page).toHaveURL(/#\/tasks$/);
  });

  test('AUTH-02 leading and trailing spaces in the username are ignored', async ({ loginPage }) => {
    const tasks = await loginPage.loginAs(`  ${USER}  `, PASS);

    await expect(tasks.welcome).toHaveText('Welcome, qa_user');
  });

  const invalidCredentials = [
    { name: 'empty username', username: '', password: PASS, error: MSG.USERNAME_REQUIRED },
    { name: 'whitespace username', username: '   ', password: PASS, error: MSG.USERNAME_REQUIRED },
    { name: 'empty password', username: USER, password: '', error: MSG.PASSWORD_REQUIRED },
    { name: 'both empty', username: '', password: '', error: MSG.USERNAME_REQUIRED },
    { name: 'unknown user', username: 'unknown_user', password: PASS, error: MSG.INVALID_CREDENTIALS },
    { name: 'wrong password', username: USER, password: 'wrong', error: MSG.INVALID_CREDENTIALS },
    { name: 'username is case-sensitive', username: 'QA_USER', password: PASS, error: MSG.INVALID_CREDENTIALS },
    { name: 'password is case-sensitive', username: USER, password: 'passw0rd!', error: MSG.INVALID_CREDENTIALS },
    { name: 'password is never trimmed', username: USER, password: `${PASS} `, error: MSG.INVALID_CREDENTIALS },
  ];

  for (const c of invalidCredentials) {
    test(`AUTH-03 rejects ${c.name} @smoke`, async ({ loginPage, page }) => {
      expect(await loginPage.attemptLogin(c.username, c.password)).toBe(c.error);
      await expect(loginPage.heading).toBeVisible();
      await expect(page).toHaveURL(/#\/login$/);
    });
  }

  test('AUTH-04 password is masked and cleared after a failed attempt', async ({ loginPage }) => {
    await expect(loginPage.password).toHaveAttribute('type', 'password');

    await loginPage.attemptLogin(USER, 'wrong');

    await expect(loginPage.password).toHaveValue('');
    await expect(loginPage.username).toHaveValue(USER);
  });

  test('AUTH-05 account locks after three failures, even for the correct password @smoke', async ({ loginPage, page }) => {
    expect.soft(await loginPage.attemptLogin(USER, 'bad-1')).toBe(MSG.INVALID_CREDENTIALS);
    expect.soft(await loginPage.attemptLogin(USER, 'bad-2')).toBe(MSG.INVALID_CREDENTIALS);
    expect.soft(await loginPage.attemptLogin(USER, 'bad-3')).toBe(MSG.ACCOUNT_LOCKED);
    expect.soft(await loginPage.attemptLogin(USER, PASS)).toBe(MSG.ACCOUNT_LOCKED);

    // Audit check inside a functional test: the lockout must leave exactly one trace.
    expect(await auditCount(page, 'LOGIN_FAILED')).toBe(3);
    expect(await auditCount(page, 'ACCOUNT_LOCKED')).toBe(1);
  });

  test('AUTH-06 blank-field errors do not count toward the lockout', async ({ loginPage }) => {
    await loginPage.attemptLogin('', 'x');
    await loginPage.attemptLogin(USER, '');
    await loginPage.attemptLogin('', '');
    expect(await loginPage.attemptLogin(USER, 'bad-1')).toBe(MSG.INVALID_CREDENTIALS);

    await loginPage.loginAs(USER, PASS);
  });

  test('AUTH-07 a successful login resets the failed-attempt counter', async ({ loginPage }) => {
    await loginPage.attemptLogin(USER, 'bad-1');
    await loginPage.attemptLogin(USER, 'bad-2');
    const login = await (await loginPage.loginAs(USER, PASS)).logout();

    // Two more failures would lock the account if the counter had not been reset.
    await login.attemptLogin(USER, 'bad-3');
    expect(await login.attemptLogin(USER, 'bad-4')).toBe(MSG.INVALID_CREDENTIALS);
    await login.loginAs(USER, PASS);
  });

  test('AUTH-08 pressing Enter (the keyboard "Go" key) submits the form', async ({ loginPage }) => {
    await loginPage.username.fill(USER);
    await loginPage.password.fill(PASS);
    await loginPage.password.press('Enter');

    await expect(loginPage.heading).toBeHidden();
  });
});
