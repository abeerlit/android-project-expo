package co.voxo.android.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = VoxoClipboardModule.NAME)
class VoxoClipboardModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  private val clipboardManager: ClipboardManager
    get() =
      context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

  @ReactMethod
  fun setImageFromFilePath(filePath: String, promise: Promise) {
    try {
      val normalizedPath =
        if (filePath.startsWith("file://")) {
          Uri.parse(filePath).path ?: filePath
        } else {
          filePath
        }

      val file = File(normalizedPath)
      if (!file.exists() || !file.isFile) {
        promise.reject("ENOENT", "Image file not found: $normalizedPath")
        return
      }

      val contentUri: Uri =
        FileProvider.getUriForFile(
          context,
          "${context.packageName}.fileprovider",
          file
        )

      val mimeType = context.contentResolver.getType(contentUri) ?: "image/jpeg"
      val clip = ClipData.newUri(context.contentResolver, "Image", contentUri)
      clipboardManager.setPrimaryClip(clip)
      promise.resolve(mimeType)
    } catch (e: Exception) {
      promise.reject("CLIPBOARD_SET_IMAGE", e.message, e)
    }
  }

  @ReactMethod
  fun shareFile(filePath: String, mimeType: String, title: String, promise: Promise) {
    try {
      val normalizedPath =
        if (filePath.startsWith("file://")) {
          Uri.parse(filePath).path ?: filePath
        } else {
          filePath
        }

      val file = File(normalizedPath)
      if (!file.exists() || !file.isFile) {
        promise.reject("ENOENT", "File not found: $normalizedPath")
        return
      }

      val contentUri: Uri =
        FileProvider.getUriForFile(
          context,
          "${context.packageName}.fileprovider",
          file
        )
      val resolvedMime =
        mimeType.ifBlank {
          context.contentResolver.getType(contentUri) ?: "application/octet-stream"
        }

      val intent =
        Intent(Intent.ACTION_SEND).apply {
          type = resolvedMime
          putExtra(Intent.EXTRA_STREAM, contentUri)
          clipData = ClipData.newUri(context.contentResolver, title, contentUri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

      val chooser =
        Intent.createChooser(intent, title).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      context.startActivity(chooser)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SHARE_FILE", e.message, e)
    }
  }

  companion object {
    const val NAME = "VoxoClipboard"
  }
}
