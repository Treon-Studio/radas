// AUTO-GENERATED Zodios client
import { makeApi, Zodios, type ZodiosOptions } from '@zodios/core'
import { z } from 'zod'


const User = z.object({ id: z.string(), name: z.string(), age: z.number(), createdAt: z.string(), email: z.string() }).partial().passthrough()

const UserInput = z.object({ age: z.number(), email: z.string(), name: z.string() }).partial().passthrough()

const Error = z.object({ code: z.number(), message: z.string() }).partial().passthrough()


export const schemas = {

  User,

  UserInput,

  Error,

};

const endpoints = makeApi([

  {
    method: "get",
    path: "/users",
    alias: "getUsers",
    description: `Returns a list of users`,
    requestFormat: "json",
    
    response: z.any(),
    
  },

  {
    method: "post",
    path: "/users",
    alias: "createUser",
    description: `Creates a new user`,
    requestFormat: "json",
    
    parameters: [
      
      
      { name: "body", type: "Body", schema: z.object({}) },
      
    ],
    
    response: z.any(),
    
  },

  {
    method: "put",
    path: "/users/{id}",
    alias: "updateUser",
    description: `Updates a user`,
    requestFormat: "json",
    
    parameters: [
      
      { name: "id", type: "Path", schema: z.string() },
      
      
      { name: "body", type: "Body", schema: z.object({}) },
      
    ],
    
    response: z.any(),
    
  },

  {
    method: "delete",
    path: "/users/{id}",
    alias: "deleteUser",
    description: `Deletes a user`,
    requestFormat: "json",
    
    parameters: [
      
      { name: "id", type: "Path", schema: z.string() },
      
      
    ],
    
    response: z.any(),
    
  },

  {
    method: "get",
    path: "/users/{id}",
    alias: "getUserById",
    description: `Returns a user by ID`,
    requestFormat: "json",
    
    parameters: [
      
      { name: "id", type: "Path", schema: z.string() },
      
      
    ],
    
    response: z.any(),
    
  },

])

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
    return new Zodios(baseUrl, endpoints, options);
}
