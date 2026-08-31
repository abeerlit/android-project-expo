package co.voxo.android.clipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
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
      val file = File(normalizePath(filePath))
      if (!file.exists() || !file.isFile) {
        promise.reject("ENOENT", "Image file not found: ${file.absolutePath}")
        return
      }

      val contentUri: Uri =
        FileProvider.getUriForFile(
          context,
          "${context.packageName}.fileprovider",
          file
        )

      val mimeType = mimeFromFile(file)
      val clip =
        ClipData(
          ClipDescription("Image", arrayOf(mimeType)),
          ClipData.Item(contentUri)
        )
      clipboardManager.setPrimaryClip(clip)
      promise.resolve(mimeType)
    } catch (e: Exception) {
      promise.reject("CLIPBOARD_SET_IMAGE", e.message, e)
    }
  }

  @ReactMethod
  fun copyClipboardImageToCache(promise: Promise) {
    try {
      val clip = clipboardManager.primaryClip
      if (clip == null || clip.itemCount == 0) {
        promise.reject("ENOIMAGE", "Clipboard is empty")
        return
      }

      var imageUri: Uri? = null
      var mimeType = "image/jpeg"
      for (i in 0 until clip.itemCount) {
        val uri = clip.getItemAt(i).uri ?: continue
        val type =
          context.contentResolver.getType(uri) ?: mimeFromPath(uri.toString())
        if (type.startsWith("image/") || looksLikeImage(uri.toString())) {
          imageUri = uri
          mimeType = if (type.startsWith("image/")) type else "image/jpeg"
          break
        }
      }

      if (imageUri == null) {
        promise.reject("ENOIMAGE", "No image on clipboard")
        return
      }

      val ext = extFromMime(mimeType)
      val outFile = File(context.cacheDir, "voxo_paste_${System.currentTimeMillis()}.$ext")
      val input = context.contentResolver.openInputStream(imageUri)
      if (input == null) {
        promise.reject("EREAD", "Could not read clipboard image")
        return
      }
      input.use { ins ->
        outFile.outputStream().use { outs -> ins.copyTo(outs) }
      }
      if (!outFile.exists() || outFile.length() == 0L) {
        outFile.delete()
        promise.reject("EREAD", "Clipboard image was empty")
        return
      }

      val map = Arguments.createMap()
      map.putString("path", outFile.absolutePath)
      map.putString("mimeType", mimeType)
      map.putString("fileName", outFile.name)
      map.putDouble("fileSize", outFile.length().toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("CLIPBOARD_GET_IMAGE", e.message, e)
    }
  }

  companion object {
    const val NAME = "VoxoClipboard"

    private fun normalizePath(filePath: String): String =
      if (filePath.startsWith("file://")) {
        Uri.parse(filePath).path ?: filePath
      } else {
        filePath
      }

    private fun mimeFromFile(file: File): String = mimeFromPath(file.name)

    private fun mimeFromPath(path: String): String {
      val lower = path.lowercase()
      return when {
        lower.endsWith(".png") -> "image/png"
        lower.endsWith(".gif") -> "image/gif"
        lower.endsWith(".webp") -> "image/webp"
        lower.endsWith(".heic") -> "image/heic"
        lower.endsWith(".heif") -> "image/heif"
        else -> "image/jpeg"
      }
    }

    private fun looksLikeImage(path: String): Boolean {
      val lower = path.lowercase()
      return lower.contains("image/") ||
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".gif") ||
        lower.endsWith(".webp") ||
        lower.endsWith(".heic") ||
        lower.endsWith(".heif")
    }

    private fun extFromMime(mimeType: String): String =
      when {
        mimeType.contains("png") -> "png"
        mimeType.contains("gif") -> "gif"
        mimeType.contains("webp") -> "webp"
        mimeType.contains("heic") -> "heic"
        mimeType.contains("heif") -> "heif"
        else -> "jpg"
      }
  }
}
