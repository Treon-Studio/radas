package com.helloworld.utils

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.FieldMap
import retrofit2.http.GET
import retrofit2.http.HeaderMap
import retrofit2.http.POST
import retrofit2.http.Url

/**
 * Retrofit API interface for fetching templates and making generic network requests.
 */
interface TemplateApi {
    /**
     * Retrieves a template from the specified URL using a GET request.
     * @param u The URL to fetch the template from.
     * @return A Retrofit Call object representing the asynchronous HTTP request.
     */
    @GET
    fun getTemplate(@Url u: String): Call<ResponseBody>

    /**
     * Performs a GET request to the specified URL with the given headers.
     * @param url The URL to make the GET request to.
     * @param headers A map of header key-value pairs to include in the request.
     * @return A Retrofit Call object representing the asynchronous HTTP request.
     */
    @GET
    fun get(@Url url: String, @HeaderMap headers: Map<String, String>): Call<ResponseBody>

    /**
     * Performs a POST request to the specified URL with form data and headers.
     * @param url The URL to make the POST request to.
     * @param fields A map of form field key-value pairs to include in the request body.
     * @param headers A map of header key-value pairs to include in the request.
     * @return A Retrofit Call object representing the asynchronous HTTP request.
     */
    @POST
    fun postForm(
        @Url url: String,
        @FieldMap fields: Map<String, String>,
        @HeaderMap headers: Map<String, String>
    ): Call<ResponseBody>

    /**
     * Performs a POST request to the specified URL with a request body and headers.
     * @param url The URL to make the POST request to.
     * @param data The request body.
     * @param headers A map of header key-value pairs to include in the request.
     * @return A Retrofit Call object representing the asynchronous HTTP request.
     */
    @POST
    fun postData(
        @Url url: String,
        @Body data: RequestBody,
        @HeaderMap headers: Map<String, String>
    ): Call<ResponseBody>
}