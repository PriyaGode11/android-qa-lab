package com.qalab.tasklab.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthServiceTest {

    private fun failure(result: LoginResult) = (result as LoginResult.Failure).message

    @Test
    fun validCredentialsSucceed() {
        val result = AuthService().login("qa_user", "Passw0rd!")
        assertEquals(LoginResult.Success("qa_user"), result)
    }

    @Test
    fun usernameIsTrimmed() {
        val result = AuthService().login("  qa_user  ", "Passw0rd!")
        assertEquals(LoginResult.Success("qa_user"), result)
    }

    @Test
    fun blankUsernameIsRejectedWithoutCountingAnAttempt() {
        val auth = AuthService()
        assertEquals(Messages.USERNAME_REQUIRED, failure(auth.login("   ", "x")))
        assertEquals(0, auth.failedAttempts)
    }

    @Test
    fun emptyPasswordIsRejected() {
        assertEquals(Messages.PASSWORD_REQUIRED, failure(AuthService().login("qa_user", "")))
    }

    @Test
    fun usernameIsCaseSensitive() {
        assertEquals(Messages.INVALID_CREDENTIALS, failure(AuthService().login("QA_USER", "Passw0rd!")))
    }

    @Test
    fun locksAfterThreeFailures() {
        val auth = AuthService()
        assertEquals(Messages.INVALID_CREDENTIALS, failure(auth.login("qa_user", "bad1")))
        assertEquals(Messages.INVALID_CREDENTIALS, failure(auth.login("qa_user", "bad2")))
        assertEquals(Messages.ACCOUNT_LOCKED, failure(auth.login("qa_user", "bad3")))
        assertTrue(auth.isLocked)
        // Even correct credentials are refused once locked.
        assertEquals(Messages.ACCOUNT_LOCKED, failure(auth.login("qa_user", "Passw0rd!")))
    }

    @Test
    fun successResetsFailedAttempts() {
        val auth = AuthService(failedAttempts = 2)
        auth.login("qa_user", "Passw0rd!")
        assertEquals(0, auth.failedAttempts)
        assertFalse(auth.isLocked)
    }

    @Test
    fun restoredLockStateIsHonoured() {
        val auth = AuthService(failedAttempts = 3)
        assertEquals(Messages.ACCOUNT_LOCKED, failure(auth.login("qa_user", "Passw0rd!")))
    }
}
