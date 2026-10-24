package com.qalab.tasklab.domain

data class Task(val id: Long, val title: String, val done: Boolean = false)

sealed class AddResult {
    data class Added(val task: Task) : AddResult()
    data class Rejected(val message: String) : AddResult()
}

/**
 * In-memory task list with all validation rules. Persistence is handled by
 * the UI layer, which saves [tasks] after every change.
 */
class TaskList(initial: List<Task> = emptyList()) {
    private val items = initial.toMutableList()
    private var nextId = (items.maxOfOrNull { it.id } ?: 0L) + 1

    val tasks: List<Task>
        get() = items.toList()

    val doneCount: Int
        get() = items.count { it.done }

    fun add(rawTitle: String): AddResult {
        val title = normalize(rawTitle)
        val error = when {
            title.isEmpty() -> Messages.TASK_EMPTY
            title.length > MAX_TITLE_LENGTH -> Messages.TASK_TOO_LONG
            items.any { it.title.equals(title, ignoreCase = true) } -> Messages.TASK_DUPLICATE
            else -> null
        }
        if (error != null) return AddResult.Rejected(error)

        val task = Task(id = nextId++, title = title)
        items.add(task)
        return AddResult.Added(task)
    }

    fun setDone(id: Long, done: Boolean) {
        val index = items.indexOfFirst { it.id == id }
        if (index >= 0) items[index] = items[index].copy(done = done)
    }

    fun delete(id: Long): Boolean = items.removeAll { it.id == id }

    /** Removes completed tasks and returns how many were removed. */
    fun clearCompleted(): Int {
        val before = items.size
        items.removeAll { it.done }
        return before - items.size
    }

    /** e.g. "No tasks yet", "1 task, 0 done", "3 tasks, 2 done". */
    fun summary(): String {
        if (items.isEmpty()) return Messages.NO_TASKS
        val noun = if (items.size == 1) "task" else "tasks"
        return "${items.size} $noun, $doneCount done"
    }

    companion object {
        const val MAX_TITLE_LENGTH = 40

        /** Trims the title and collapses runs of whitespace to one space. */
        fun normalize(raw: String): String = raw.trim().replace(Regex("\\s+"), " ")
    }
}
