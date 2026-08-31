package co.voxo.android.calling.ui

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ListView
import androidx.appcompat.app.AppCompatActivity
import co.voxo.android.R
import co.voxo.android.calling.VoxoCallContactPrefs
import co.voxo.android.calling.VoxoLinphoneManager

/**
 * Native contact picker for blind transfer / "add to call". Reads the call contact cache
 * provisioned from JS (syncCallContacts). Tapping a contact (or a typed number) performs
 * a blind transfer of the call passed in via the "callId" extra.
 */
class ContactPickerActivity : AppCompatActivity() {

    private data class Row(val name: String, val number: String) {
        override fun toString(): String = if (name.isNotBlank()) "$name\n$number" else number
    }

    private val rows = mutableListOf<Row>()
    private val filtered = mutableListOf<Row>()
    private lateinit var adapter: ArrayAdapter<Row>
    private var callId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.native_contact_picker)
        callId = intent.getStringExtra("callId")

        loadContacts()
        adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, filtered)
        val list = findViewById<ListView>(R.id.picker_list)
        list.adapter = adapter
        list.setOnItemClickListener { _, _, position, _ ->
            transferTo(filtered[position].number)
        }

        val search = findViewById<EditText>(R.id.picker_search)
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {
                applyFilter(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) {}
        })
        // Long-press the search field action: allow dialing a raw typed number via IME "done".
        search.setOnEditorActionListener { _, _, _ ->
            val typed = search.text.toString().trim()
            if (typed.isNotEmpty() && typed.any { it.isDigit() }) {
                transferTo(typed)
                true
            } else {
                false
            }
        }
        applyFilter("")
    }

    private fun loadContacts() {
        val json = VoxoCallContactPrefs.allContacts(this)
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val obj = json.optJSONObject(key) ?: continue
            val number = obj.optString("number", key)
            val name = obj.optString("name", number)
            rows.add(Row(name, number))
        }
        rows.sortBy { it.name.lowercase() }
    }

    private fun applyFilter(query: String) {
        filtered.clear()
        val q = query.trim().lowercase()
        if (q.isEmpty()) {
            filtered.addAll(rows)
        } else {
            filtered.addAll(
                rows.filter {
                    it.name.lowercase().contains(q) || it.number.contains(q)
                }
            )
            if (q.any { it.isDigit() }) {
                filtered.add(0, Row("", query.trim()))
            }
        }
        adapter.notifyDataSetChanged()
    }

    private fun transferTo(number: String) {
        callId?.let { VoxoLinphoneManager.transferBlind(it, number) }
        finish()
    }
}
