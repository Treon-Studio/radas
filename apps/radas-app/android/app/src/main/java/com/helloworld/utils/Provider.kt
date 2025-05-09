package com.helloworld.utils

import android.content.Context
import com.lynx.tasm.provider.AbsTemplateProvider
import java.io.IOException
import java.io.ByteArrayOutputStream

/**
 * A template provider that loads templates from the application's assets.
 * @param context The application context.
 */
class Provider(context: Context) : AbsTemplateProvider() {

    private var mContext: Context = context.applicationContext

    /**
     * Loads a template from the assets folder.
     * @param uri The URI of the template file in the assets folder.
     * @param callback The callback to be invoked with the template data or an error.
     */
    override fun loadTemplate(uri: String, callback: Callback) {
        Thread {
            try {
                mContext.assets.open(uri).use { inputStream ->
                    ByteArrayOutputStream().use { byteArrayOutputStream ->
                        val buffer = ByteArray(1024)
                        var length: Int
                        while ((inputStream.read(buffer).also { length = it }) != -1) {
                            byteArrayOutputStream.write(buffer, 0, length)
                        }
                        callback.onSuccess(byteArrayOutputStream.toByteArray())
                    }
                }
            } catch (e: IOException) {
                callback.onFailed(e.message)
            }
        }.start()
    }
}