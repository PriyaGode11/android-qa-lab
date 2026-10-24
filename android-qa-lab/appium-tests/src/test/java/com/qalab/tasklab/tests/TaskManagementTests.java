package com.qalab.tasklab.tests;

import com.qalab.tasklab.base.BaseTest;
import com.qalab.tasklab.pages.DeleteDialog;
import com.qalab.tasklab.pages.TaskListPage;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;
import org.testng.asserts.SoftAssert;

import java.util.List;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

public class TaskManagementTests extends BaseTest {

    private static final String EMPTY = "Task cannot be empty";
    private static final String TOO_LONG = "Task must be 40 characters or fewer";
    private static final String DUPLICATE = "Task already exists";

    @Test(groups = "regression",
          description = "TASK-01: A new user sees the empty state and a disabled 'Clear completed'")
    public void newUserSeesEmptyState() {
        TaskListPage tasks = loginAsValidUser();

        SoftAssert soft = new SoftAssert();
        soft.assertTrue(tasks.isEmptyStateShown(), "empty state shown");
        soft.assertEquals(tasks.summary(), "No tasks yet");
        soft.assertFalse(tasks.isClearCompletedEnabled(), "'Clear completed' disabled");
        soft.assertTrue(tasks.visibleTaskTitles().isEmpty(), "no rows");
        soft.assertAll();
    }

    @Test(groups = {"smoke", "regression"},
          description = "TASK-02: Adding a task shows it in the list and updates the summary")
    public void addTaskAppearsInList() {
        TaskListPage tasks = loginAsValidUser().addTasks("Buy milk");

        assertTrue(tasks.hasTask("Buy milk"));
        assertEquals(tasks.summary(), "1 task, 0 done");
        assertFalse(tasks.isEmptyStateShown(), "Empty state should disappear");
        assertTrue(tasks.isTaskInputEmpty(), "Input should be cleared after adding");
    }

    @Test(groups = "regression",
          description = "TASK-03: Tasks are listed in the order they were added")
    public void tasksKeepInsertionOrder() {
        TaskListPage tasks = loginAsValidUser().addTasks("First", "Second", "Third");

        assertEquals(tasks.visibleTaskTitles(), List.of("First", "Second", "Third"));
        assertEquals(tasks.summary(), "3 tasks, 0 done");
    }

    @DataProvider(name = "rejectedTitles")
    public Object[][] rejectedTitles() {
        return new Object[][]{
                {"", EMPTY},
                {"      ", EMPTY},
                {"x".repeat(41), TOO_LONG},
        };
    }

    @Test(groups = {"smoke", "regression"}, dataProvider = "rejectedTitles",
          description = "TASK-04: Blank and over-length titles are rejected with a clear message")
    public void invalidTitlesAreRejected(String title, String expectedError) {
        TaskListPage tasks = loginAsValidUser().tryAddTask(title);

        assertEquals(tasks.errorMessage(), expectedError);
        assertEquals(tasks.summary(), "No tasks yet", "Nothing should have been added");
    }

    @Test(groups = "regression",
          description = "TASK-05: Exactly 40 characters is accepted (boundary value)")
    public void fortyCharacterTitleIsAccepted() {
        String forty = "y".repeat(40);
        TaskListPage tasks = loginAsValidUser().addTasks(forty);

        assertTrue(tasks.hasTask(forty));
    }

    @Test(groups = "regression",
          description = "TASK-06: Duplicate titles are rejected regardless of case and spacing")
    public void duplicatesAreRejectedIgnoringCaseAndSpacing() {
        TaskListPage tasks = loginAsValidUser().addTasks("Buy milk");

        assertEquals(tasks.tryAddTask("BUY   milk").errorMessage(), DUPLICATE);
        assertEquals(tasks.summary(), "1 task, 0 done");
    }

    @Test(groups = "regression",
          description = "TASK-07: Extra whitespace in a title is trimmed and collapsed")
    public void whitespaceIsNormalized() {
        TaskListPage tasks = loginAsValidUser().addTasks("   Pay     rent   ");

        assertTrue(tasks.hasTask("Pay rent"));
    }

    @Test(groups = "regression",
          description = "TASK-08: Accented characters and symbols are stored exactly")
    public void specialCharactersAreSupported() {
        String title = "Café & résumé #1 (draft)";
        TaskListPage tasks = loginAsValidUser().addTasks(title);

        assertTrue(tasks.hasTask(title));
    }

    @Test(groups = "regression",
          description = "TASK-09: The error message clears after a successful add")
    public void errorClearsAfterSuccessfulAdd() {
        TaskListPage tasks = loginAsValidUser().tryAddTask("");
        assertTrue(tasks.isErrorShown());

        tasks.addTasks("Valid task");
        assertFalse(tasks.isErrorShown(), "Stale error should be hidden");
    }

    @Test(groups = {"smoke", "regression"},
          description = "TASK-10: Completing and un-completing a task updates the summary")
    public void toggleTaskUpdatesSummary() {
        TaskListPage tasks = loginAsValidUser().addTasks("One", "Two");

        tasks.toggleTask("One");
        assertTrue(tasks.isTaskDone("One"));
        assertFalse(tasks.isTaskDone("Two"));
        assertEquals(tasks.summary(), "2 tasks, 1 done");
        assertTrue(tasks.isClearCompletedEnabled());

        tasks.toggleTask("One");
        assertFalse(tasks.isTaskDone("One"));
        assertEquals(tasks.summary(), "2 tasks, 0 done");
        assertFalse(tasks.isClearCompletedEnabled());
    }

    @Test(groups = {"smoke", "regression"},
          description = "TASK-11: Deleting asks for confirmation, then removes only that task")
    public void deleteWithConfirmation() {
        TaskListPage tasks = loginAsValidUser().addTasks("Keep me", "Delete me");

        DeleteDialog dialog = tasks.tapDelete("Delete me");
        assertEquals(dialog.message(), "\"Delete me\" will be removed.");
        tasks = dialog.confirm();

        assertEquals(tasks.visibleTaskTitles(), List.of("Keep me"));
        assertEquals(tasks.summary(), "1 task, 0 done");
    }

    @Test(groups = "regression",
          description = "TASK-12: Cancelling the delete dialog keeps the task")
    public void cancelDeleteKeepsTask() {
        TaskListPage tasks = loginAsValidUser().addTasks("Important");

        tasks = tasks.tapDelete("Important").cancel();

        assertTrue(tasks.hasTask("Important"));
        assertEquals(tasks.summary(), "1 task, 0 done");
    }

    @Test(groups = "regression",
          description = "TASK-13: Deleting the last task brings back the empty state")
    public void deletingLastTaskShowsEmptyState() {
        TaskListPage tasks = loginAsValidUser().addTasks("Only task");

        tasks = tasks.tapDelete("Only task").confirm();

        assertTrue(tasks.isEmptyStateShown());
        assertEquals(tasks.summary(), "No tasks yet");
    }

    @Test(groups = "regression",
          description = "TASK-14: 'Clear completed' removes only completed tasks")
    public void clearCompletedRemovesOnlyDoneTasks() {
        TaskListPage tasks = loginAsValidUser().addTasks("A", "B", "C");
        tasks.toggleTask("A").toggleTask("C");

        tasks.clearCompleted();

        assertEquals(tasks.visibleTaskTitles(), List.of("B"));
        assertEquals(tasks.summary(), "1 task, 0 done");
        assertFalse(tasks.isClearCompletedEnabled());
    }

    @Test(groups = "regression",
          description = "TASK-15: Long lists scroll and every task stays reachable")
    public void longListIsScrollable() {
        String[] titles = new String[15];
        for (int i = 0; i < titles.length; i++) {
            titles[i] = "Task " + (i + 1);
        }
        TaskListPage tasks = loginAsValidUser().addTasks(titles);

        assertEquals(tasks.summary(), "15 tasks, 0 done");
        tasks.scrollToTask("Task 15");
        assertTrue(tasks.hasTask("Task 15"));
        tasks.scrollToTask("Task 1");
        assertTrue(tasks.hasTask("Task 1"));
    }
}
