package com.qalab.tasklab.data

import android.content.Context
import com.qalab.tasklab.domain.Task
import org.json.JSONArray
import org.json.JSONObject

/**
 * SharedPreferences-backed storage for the session, the failed-login count
 * and the task list. Clearing app data (pm clear) resets everything, which is
 * how the Appium suite isolates tests.
 */
class AppStorage(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var loggedInUser: String?
        get() = prefs.getString(KEY_USER, null)
        set(value) = prefs.edit().putString(KEY_USER, value).apply()

    var failedAttempts: Int
        get() = prefs.getInt(KEY_FAILED_ATTEMPTS, 0)
        set(value) = prefs.edit().putInt(KEY_FAILED_ATTEMPTS, value).apply()

    fun loadTasks(): List<Task> {
        val raw = prefs.getString(KEY_TASKS, null) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            (0 until array.length()).map { i ->
                val obj = array.getJSONObject(i)
                Task(
                    id = obj.getLong("id"),
                    title = obj.getString("title"),
                    done = obj.getBoolean("done"),
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveTasks(tasks: List<Task>) {
        val array = JSONArray()
        tasks.forEach { task ->
            array.put(
                JSONObject()
                    .put("id", task.id)
                    .put("title", task.title)
                    .put("done", task.done)
            )
        }
        prefs.edit().putString(KEY_TASKS, array.toString()).apply()
    }

    private companion object {
        const val PREFS_NAME = "tasklab"
        const val KEY_USER = "logged_in_user"
        const val KEY_FAILED_ATTEMPTS = "failed_attempts"
        const val KEY_TASKS = "tasks"
    }
}
