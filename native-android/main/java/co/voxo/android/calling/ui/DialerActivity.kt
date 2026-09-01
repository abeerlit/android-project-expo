package co.voxo.android.calling.ui

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import co.voxo.android.R
import co.voxo.android.calling.VoxoLinphoneManager

/**
 * Native dialer. Used both as a standalone keypad and (mode="secondCall") to add a
 * second call / start an attended transfer while an existing call is held.
 */
class DialerActivity : AppCompatActivity() {

    private lateinit var input: EditText
    private var secondCall = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.native_dialer)
        secondCall = intent.getStringExtra("mode") == "secondCall"
        input = findViewById(R.id.dialer_input)
        intent.getStringExtra("prefill")?.let { input.setText(it) }

        wireKeypad()
        findViewById<ImageView>(R.id.dialer_backspace).setOnClickListener {
            val text = input.text
            if (text.isNotEmpty()) text.delete(text.length - 1, text.length)
        }
        findViewById<ImageView>(R.id.dialer_call_button).setOnClickListener {
            val number = input.text.toString().trim()
            if (number.isEmpty()) return@setOnClickListener
            if (secondCall) {
                VoxoLinphoneManager.startSecondCall(number, null)
            } else {
                VoxoLinphoneManager.startCall(number, null)
            }
            finish()
        }
    }

    private fun wireKeypad() {
        val grid = findGrid() ?: return
        for (i in 0 until grid.childCount) {
            val child = grid.getChildAt(i)
            if (child is TextView) {
                child.setOnClickListener {
                    input.append(child.text)
                }
            }
        }
    }

    private fun findGrid(): GridLayout? {
        val root = findViewById<ViewGroup>(android.R.id.content)
        return firstGrid(root)
    }

    private fun firstGrid(view: View): GridLayout? {
        if (view is GridLayout) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val found = firstGrid(view.getChildAt(i))
                if (found != null) return found
            }
        }
        return null
    }
}
