package com.qalab.tasklab.domain

sealed class LoginResult {
    data class Success(val username: String) : LoginResult()
    data class Failure(val message: String) : LoginResult()
}

/**
 * Validates credentials and enforces a lockout after [maxAttempts] failures.
 * The failed-attempt count is passed in and read back so the UI layer can
 * persist it across restarts.
 */
class AuthService(
    failedAttempts: Int = 0,
    private val validUsername: String = DEFAULT_USERNAME,
    private val validPassword: String = DEFAULT_PASSWORD,
    private val maxAttempts: Int = 3,
) {
    var failedAttempts: Int = failedAttempts
        private set

    val isLocked: Boolean
        get() = failedAttempts >= maxAttempts

    fun login(username: String, password: String): LoginResult {
        if (isLocked) return LoginResult.Failure(Messages.ACCOUNT_LOCKED)

        val user = username.trim()
        if (user.isEmpty()) return LoginResult.Failure(Messages.USERNAME_REQUIRED)
        if (password.isEmpty()) return LoginResult.Failure(Messages.PASSWORD_REQUIRED)

        if (user == validUsername && password == validPassword) {
            failedAttempts = 0
            return LoginResult.Success(user)
        }

        failedAttempts++
        return LoginResult.Failure(
            if (isLocked) Messages.ACCOUNT_LOCKED else Messages.INVALID_CREDENTIALS
        )
    }

    companion object {
        const val DEFAULT_USERNAME = "qa_user"
        const val DEFAULT_PASSWORD = "Passw0rd!"
    }
}
