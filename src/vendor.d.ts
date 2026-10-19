declare module 'pdfmake/build/pdfmake';
declare module '*.ttf?url' {
  const url: string;
  export default url;
}
