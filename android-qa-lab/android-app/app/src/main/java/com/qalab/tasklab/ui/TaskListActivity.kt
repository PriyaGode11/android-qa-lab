package com.qalab.tasklab.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.qalab.tasklab.R
import com.qalab.tasklab.data.AppStorage
import com.qalab.tasklab.domain.AddResult
import com.qalab.tasklab.domain.Task
import com.qalab.tasklab.domain.TaskList

class TaskListActivity : AppCompatActivity() {

    private lateinit var storage: AppStorage
    private lateinit var taskList: TaskList
    private lateinit var adapter: TaskAdapter

    private lateinit var taskInput: EditText
    private lateinit var errorText: TextView
    private lateinit var summaryText: TextView
    private lateinit var emptyState: TextView
    private lateinit var clearCompletedButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        storage = AppStorage(this)

        val user = storage.loggedInUser
        if (user == null) {
            openLogin()
            return
        }

        setContentView(R.layout.activity_task_list)
        taskList = TaskList(storage.loadTasks())

        findViewById<TextView>(R.id.welcome_text).text = getString(R.string.welcome, user)
        taskInput = findViewById(R.id.task_input)
        errorText = findViewById(R.id.task_error)
        summaryText = findViewById(R.id.summary_text)
        emptyState = findViewById(R.id.empty_state)
        clearCompletedButton = findViewById(R.id.clear_completed_button)

        adapter = TaskAdapter(
            onToggle = { task, done ->
                taskList.setDone(task.id, done)
                persistAndRefresh()
            },
            onDelete = { task -> confirmDelete(task) },
        )
        findViewById<RecyclerView>(R.id.task_recycler).apply {
            layoutManager = LinearLayoutManager(this@TaskListActivity)
            adapter = this@TaskListActivity.adapter
        }

        findViewById<Button>(R.id.add_button).setOnClickListener { addTask() }
        taskInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                addTask()
                true
            } else {
                false
            }
        }
        clearCompletedButton.setOnClickListener {
            taskList.clearCompleted()
            persistAndRefresh()
        }
        findViewById<Button>(R.id.logout_button).setOnClickListener {
            storage.loggedInUser = null
            openLogin()
        }

        refresh()
    }

    private fun addTask() {
        when (val result = taskList.add(taskInput.text.toString())) {
            is AddResult.Added -> {
                taskInput.text.clear()
                errorText.visibility = View.GONE
                persistAndRefresh()
            }
            is AddResult.Rejected -> {
                errorText.text = result.message
                errorText.visibility = View.VISIBLE
            }
        }
    }

    private fun confirmDelete(task: Task) {
        AlertDialog.Builder(this)
            .setTitle(R.string.delete_title)
            .setMessage(getString(R.string.delete_message, task.title))
            .setPositiveButton(R.string.delete) { _, _ ->
                taskList.delete(task.id)
                persistAndRefresh()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun persistAndRefresh() {
        storage.saveTasks(taskList.tasks)
        refresh()
    }

    private fun refresh() {
        val tasks = taskList.tasks
        adapter.submit(tasks)
        summaryText.text = taskList.summary()
        emptyState.visibility = if (tasks.isEmpty()) View.VISIBLE else View.GONE
        clearCompletedButton.isEnabled = taskList.doneCount > 0
    }

    private fun openLogin() {
        startActivity(
            Intent(this, LoginActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }
}
