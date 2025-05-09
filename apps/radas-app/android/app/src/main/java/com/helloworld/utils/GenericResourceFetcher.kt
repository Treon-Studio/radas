package com.helloworld.utils

import com.lynx.tasm.base.LLog
import com.lynx.tasm.resourceprovider.LynxResourceCallback
import com.lynx.tasm.resourceprovider.LynxResourceRequest
import com.lynx.tasm.resourceprovider.LynxResourceResponse
import com.lynx.tasm.resourceprovider.generic.LynxGenericResourceFetcher
import com.lynx.tasm.resourceprovider.generic.StreamDelegate
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.Response
import retrofit2.Retrofit
import java.io.IOException

/**
 * A generic resource fetcher for Lynx views.
 * This class handles fetching resources over the network using Retrofit.
 */
class GenericResourceFetcher : LynxGenericResourceFetcher() {

    companion object {
        const val TAG = "GenericResourceFetcher"
    }

    /**
     * Fetches a resource from the network.
     * @param request The Lynx resource request containing the URL.
     * @param callback The callback to be invoked with the resource data or an error.
     */
    override fun fetchResource(request: LynxResourceRequest?, callback: LynxResourceCallback<ByteArray>?) {
        if (request == null) {
            callback?.onResponse(LynxResourceResponse.onFailed(Throwable("request is null!")) as LynxResourceResponse<ByteArray>?)
            return
        }

        LLog.i(TAG, "fetchResource: " + request.url)
        val retrofit = Retrofit.Builder()
            .baseUrl("https://example.com/")
            .build()
        val templateApi = retrofit.create(TemplateApi::class.java)
        val call = templateApi.getTemplate(request.url)
        call.enqueue(object : retrofit2.Callback<ResponseBody> {
            override fun onResponse(call: Call<ResponseBody>, response: Response<ResponseBody>) {
                try {
                    if (response.body() != null) {
                        callback?.onResponse(LynxResourceResponse.onSuccess(response.body()!!.bytes()) as LynxResourceResponse<ByteArray>?)
                    } else {
                        callback?.onResponse(
                            LynxResourceResponse.onFailed(Throwable("response body is null.")) as LynxResourceResponse<ByteArray>?
                        )
                    }
                } catch (e: IOException) {
                    e.printStackTrace()
                    callback?.onResponse(LynxResourceResponse.onFailed(e) as LynxResourceResponse<ByteArray>?)
                }
            }

            override fun onFailure(call: Call<ResponseBody>, throwable: Throwable) {
                callback?.onResponse(LynxResourceResponse.onFailed(throwable) as LynxResourceResponse<ByteArray>?)
            }
        })
    }

    /**
     * Fetches a resource path.  Not supported in this implementation.
     * @param request The Lynx resource request.
     * @param callback The callback to be invoked.
     */
    override fun fetchResourcePath(request: LynxResourceRequest?, callback: LynxResourceCallback<String>?) {
        callback?.onResponse(
            LynxResourceResponse.onFailed(Throwable("fetchResourcePath not supported.")) as LynxResourceResponse<String>?
        )
    }

    /**
     * Fetches a resource as a stream. Not supported in this implementation.
     * @param request The Lynx resource request.
     * @param delegate The stream delegate.
     */
    override fun fetchStream(request: LynxResourceRequest?, delegate: StreamDelegate?) {
        delegate?.onError("fetchStream not supported.")
    }
}