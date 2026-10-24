package com.qalab.tasklab.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.qalab.tasklab.R
import com.qalab.tasklab.data.AppStorage
import com.qalab.tasklab.domain.AuthService
import com.qalab.tasklab.domain.LoginResult

class LoginActivity : AppCompatActivity() {

    private lateinit var storage: AppStorage
    private lateinit var usernameInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var errorText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        storage = AppStorage(this)

        // An existing session skips the login screen entirely.
        if (storage.loggedInUser != null) {
            openTaskList()
            return
        }

        setContentView(R.layout.activity_login)
        usernameInput = findViewById(R.id.username_input)
        passwordInput = findViewById(R.id.password_input)
        errorText = findViewById(R.id.login_error)

        findViewById<Button>(R.id.login_button).setOnClickListener { attemptLogin() }
        passwordInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                attemptLogin()
                true
            } else {
                false
            }
        }
    }

    private fun attemptLogin() {
        val auth = AuthService(failedAttempts = storage.failedAttempts)
        val result = auth.login(
            usernameInput.text.toString(),
            passwordInput.text.toString(),
        )
        storage.failedAttempts = auth.failedAttempts

        when (result) {
            is LoginResult.Success -> {
                storage.loggedInUser = result.username
                openTaskList()
            }
            is LoginResult.Failure -> {
                errorText.text = result.message
                errorText.visibility = View.VISIBLE
                passwordInput.text.clear()
            }
        }
    }

    private fun openTaskList() {
        startActivity(
            Intent(this, TaskListActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }
}
