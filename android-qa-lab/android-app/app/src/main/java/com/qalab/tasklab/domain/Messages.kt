package com.qalab.tasklab.domain

/**
 * Every user-facing message lives here so the app, the unit tests and the
 * Appium suite all agree on the exact wording.
 */
object Messages {
    const val USERNAME_REQUIRED = "Username is required"
    const val PASSWORD_REQUIRED = "Password is required"
    const val INVALID_CREDENTIALS = "Invalid username or password"
    const val ACCOUNT_LOCKED = "Account locked after 3 failed attempts"

    const val TASK_EMPTY = "Task cannot be empty"
    const val TASK_TOO_LONG = "Task must be 40 characters or fewer"
    const val TASK_DUPLICATE = "Task already exists"

    const val NO_TASKS = "No tasks yet"
}
