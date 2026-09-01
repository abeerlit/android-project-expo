package co.voxo.android.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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

  companion object {
    const val NAME = "VoxoClipboard"
  }
}
