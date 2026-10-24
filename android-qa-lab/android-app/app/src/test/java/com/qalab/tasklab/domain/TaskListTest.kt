package com.qalab.tasklab.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskListTest {

    private fun rejection(result: AddResult) = (result as AddResult.Rejected).message

    @Test
    fun emptyListSummary() {
        assertEquals("No tasks yet", TaskList().summary())
    }

    @Test
    fun addTaskUpdatesSummaryWithSingularNoun() {
        val list = TaskList()
        assertTrue(list.add("Buy milk") is AddResult.Added)
        assertEquals("1 task, 0 done", list.summary())
    }

    @Test
    fun blankTitlesAreRejected() {
        val list = TaskList()
        assertEquals(Messages.TASK_EMPTY, rejection(list.add("")))
        assertEquals(Messages.TASK_EMPTY, rejection(list.add("    ")))
        assertEquals(0, list.tasks.size)
    }

    @Test
    fun whitespaceIsNormalized() {
        val list = TaskList()
        list.add("  Pay    rent  ")
        assertEquals("Pay rent", list.tasks.single().title)
    }

    @Test
    fun duplicatesAreRejectedIgnoringCase() {
        val list = TaskList()
        list.add("Buy milk")
        assertEquals(Messages.TASK_DUPLICATE, rejection(list.add("BUY  milk")))
        assertEquals(1, list.tasks.size)
    }

    @Test
    fun titleLengthBoundary() {
        val list = TaskList()
        assertTrue(list.add("a".repeat(40)) is AddResult.Added)
        assertEquals(Messages.TASK_TOO_LONG, rejection(list.add("b".repeat(41))))
    }

    @Test
    fun toggleAndClearCompleted() {
        val list = TaskList()
        val first = (list.add("One") as AddResult.Added).task
        list.add("Two")
        list.setDone(first.id, true)
        assertEquals("2 tasks, 1 done", list.summary())
        assertEquals(1, list.clearCompleted())
        assertEquals(listOf("Two"), list.tasks.map { it.title })
    }

    @Test
    fun idsStayUniqueAfterReload() {
        val restored = TaskList(listOf(Task(7, "Old")))
        val added = (restored.add("New") as AddResult.Added).task
        assertEquals(8, added.id)
    }

    @Test
    fun deleteRemovesOnlyTheTargetTask() {
        val list = TaskList()
        val one = (list.add("One") as AddResult.Added).task
        list.add("Two")
        assertTrue(list.delete(one.id))
        assertEquals(listOf("Two"), list.tasks.map { it.title })
    }
}
