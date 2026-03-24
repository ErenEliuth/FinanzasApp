import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Sube una imagen a Supabase Storage y retorna la URL pública.
 * @param uri URI local de la imagen (de ImagePicker).
 * @param bucket Nombre del bucket en Supabase.
 * @param path Ruta/Nombre del archivo dentro del bucket.
 */
export async function uploadImage(uri: string, bucket: string, path: string): Promise<string | null> {
  try {
    let fileBody: any;

    if (Platform.OS === 'web') {
      // En Web, fetch devuelve un blob directamente
      const response = await fetch(uri);
      fileBody = await response.blob();
    } else {
      // En móvil (Expo), leemos el archivo como base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      fileBody = decode(base64);
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, fileBody, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('Error uploading image:', error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Unexpected error during upload:', error);
    return null;
  }
}
