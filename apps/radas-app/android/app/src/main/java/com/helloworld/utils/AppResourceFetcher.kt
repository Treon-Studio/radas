package com.helloworld.utils

import com.lynx.tasm.resourceprovider.LynxResourceCallback
import com.lynx.tasm.resourceprovider.LynxResourceRequest
import com.lynx.tasm.resourceprovider.template.LynxTemplateResourceFetcher
import com.lynx.tasm.resourceprovider.template.TemplateProviderResult
import com.lynx.tasm.resourceprovider.LynxResourceResponse
import com.lynx.tasm.core.LynxThreadPool

class AppResourceFetcher : LynxTemplateResourceFetcher() {

    /**
     * Initiates a resource request.
     * @param request LynxResourceRequest
     * @param callback Callback for the response
     */
    private fun requestResource(
        request: LynxResourceRequest,
        callback: retrofit2.Callback<okhttp3.ResponseBody>
    ) {
        val retrofit = retrofit2.Retrofit.Builder()
            .baseUrl("https://example.com/")
            .callbackExecutor(LynxThreadPool.getBriefIOExecutor())
            .build()

        val templateApi = retrofit.create(TemplateApi::class.java)
        val call = templateApi.getTemplate(request.url)
        call.enqueue(callback)
    }

    /**
     * Fetches a template.
     * @param request LynxResourceRequest
     * @param callback LynxResourceCallback<TemplateProviderResult>
     */
    override fun fetchTemplate(
        request: LynxResourceRequest?,
        callback: LynxResourceCallback<TemplateProviderResult>?
    ) {
        if (request == null) {
            callback?.onResponse(LynxResourceResponse.onFailed(Throwable("request is null!")) as LynxResourceResponse<TemplateProviderResult>?)
            return
        }

        requestResource(request, object : retrofit2.Callback<okhttp3.ResponseBody> {
            override fun onResponse(
                call: retrofit2.Call<okhttp3.ResponseBody>,
                response: retrofit2.Response<okhttp3.ResponseBody>
            ) {
                if (response.body() != null) {
                    try {
                        val result = TemplateProviderResult.fromBinary(response.body()!!.bytes())
                        callback?.onResponse(LynxResourceResponse.onSuccess(result) as LynxResourceResponse<TemplateProviderResult>?)
                    } catch (e: java.io.IOException) {
                        e.printStackTrace()
                        callback?.onResponse(LynxResourceResponse.onFailed(e) as LynxResourceResponse<TemplateProviderResult>?)
                    }
                } else {
                    callback?.onResponse(LynxResourceResponse.onFailed(Throwable("Response body is null")) as LynxResourceResponse<TemplateProviderResult>?)
                }
            }

            override fun onFailure(call: retrofit2.Call<okhttp3.ResponseBody>, throwable: Throwable) {
                callback?.onResponse(LynxResourceResponse.onFailed(throwable) as LynxResourceResponse<TemplateProviderResult>?)
            }
        })
    }

    /**
     * Fetches SSR data.
     * @param request LynxResourceRequest
     * @param callback LynxResourceCallback<ByteArray>
     */
    override fun fetchSSRData(request: LynxResourceRequest?, callback: LynxResourceCallback<ByteArray>?) {
        if (request == null) {
            callback?.onResponse(LynxResourceResponse.onFailed(Throwable("request is null!")) as LynxResourceResponse<ByteArray>?)
            return
        }

        requestResource(request, object : retrofit2.Callback<okhttp3.ResponseBody> {
            override fun onResponse(
                call: retrofit2.Call<okhttp3.ResponseBody>,
                response: retrofit2.Response<okhttp3.ResponseBody>
            ) {
                try {
                    if (response.body() != null) {
                        callback?.onResponse(LynxResourceResponse.onSuccess(response.body()!!.bytes()) as LynxResourceResponse<ByteArray>?)
                    } else {
                        // Handle the case where the response body is null if needed
                        callback?.onResponse(LynxResourceResponse.onFailed(Throwable("Response body is null")) as LynxResourceResponse<ByteArray>?)
                    }
                } catch (e: java.io.IOException) {
                    e.printStackTrace()
                    callback?.onResponse(LynxResourceResponse.onFailed(e) as LynxResourceResponse<ByteArray>?)
                }
            }

            override fun onFailure(call: retrofit2.Call<okhttp3.ResponseBody>, throwable: Throwable) {
                callback?.onResponse(LynxResourceResponse.onFailed(throwable) as LynxResourceResponse<ByteArray>?)
            }
        })
    }
}