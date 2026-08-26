import { AxiosRequestConfig } from 'axios';
import { api } from './client';

export const customInstance = <T>(
    config: AxiosRequestConfig,
    options?: AxiosRequestConfig
): Promise<T> => {
    return api({
        ...config,
        ...options,
    }).then((response) => response.data);
};

export default customInstance;