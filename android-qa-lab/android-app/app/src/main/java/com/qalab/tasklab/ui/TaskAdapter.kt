package com.qalab.tasklab.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageButton
import androidx.recyclerview.widget.RecyclerView
import com.qalab.tasklab.R
import com.qalab.tasklab.domain.Task

class TaskAdapter(
    private val onToggle: (Task, Boolean) -> Unit,
    private val onDelete: (Task) -> Unit,
) : RecyclerView.Adapter<TaskAdapter.TaskViewHolder>() {

    private var items: List<Task> = emptyList()

    fun submit(tasks: List<Task>) {
        items = tasks
        notifyDataSetChanged()
    }

    override fun getItemCount(): Int = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TaskViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_task, parent, false)
        return TaskViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskViewHolder, position: Int) {
        holder.bind(items[position])
    }

    inner class TaskViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val checkBox: CheckBox = view.findViewById(R.id.task_checkbox)
        private val deleteButton: ImageButton = view.findViewById(R.id.delete_button)

        fun bind(task: Task) {
            // Detach the listener first so recycling a row doesn't fire a toggle.
            checkBox.setOnCheckedChangeListener(null)
            checkBox.text = task.title
            checkBox.isChecked = task.done
            checkBox.setOnCheckedChangeListener { _, checked -> onToggle(task, checked) }

            // Accessibility id the Appium suite uses to find each row's delete button.
            deleteButton.contentDescription =
                itemView.context.getString(R.string.delete_task_description, task.title)
            deleteButton.setOnClickListener { onDelete(task) }
        }
    }
}
